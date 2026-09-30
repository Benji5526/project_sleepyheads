// TECH §17 외부 요청: 기사·robots.txt를 가져올 때는 http/https만, localhost·사설 IP 주소는 요청하지 않는다
// (기사 링크를 이용해 서버가 내부망에 접근하게 만드는 공격 방지). 이름을 IP로 풀어 본 결과도 검사한다.
import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** 호스트 이름 → IP 주소 목록. 테스트에서 가짜로 바꿔 끼운다. */
export type ResolveHost = (hostname: string) => Promise<string[]>;

export const resolveHostWithDns: ResolveHost = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

function ipv4Blocked(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || // 이 네트워크
    a === 10 || // 사설
    a === 127 || // 자기 자신
    (a === 100 && b >= 64 && b <= 127) || // 통신사 공유 주소
    (a === 169 && b === 254) || // 링크 로컬 (클라우드 메타데이터 주소 169.254.169.254 포함)
    (a === 172 && b >= 16 && b <= 31) || // 사설
    (a === 192 && b === 168) || // 사설
    (a === 192 && b === 0) || // 예약
    (a === 198 && (b === 18 || b === 19)) || // 성능 시험용
    a >= 224 // 멀티캐스트·예약
  );
}

function ipv6Blocked(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Blocked(mapped[1]);
  // ::ffff:7f00:1 처럼 16진수로 쓴 IPv4 대응 주소도 막는다
  if (lower.startsWith("::ffff:")) return true;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 고유 로컬(사설)
    (first & 0xffc0) === 0xfe80 || // fe80::/10 링크 로컬
    (first & 0xff00) === 0xff00 // 멀티캐스트
  );
}

/** IP 주소 문자열이 사설·자기 자신·예약 대역인가 */
export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4Blocked(ip);
  if (version === 6) return ipv6Blocked(ip);
  return true; // IP가 아니면 막는다 (이 함수에는 IP만 들어와야 한다)
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * 가져와도 되는 주소인가. 막는 것: http/https 외 주소, 아이디·비밀번호가 든 주소, 80·443 외 포트,
 * `localhost`·`*.localhost`·`*.local`·`*.internal`, 사설·예약 IP(직접 적었거나 이름을 풀었을 때).
 */
export async function checkFetchableUrl(
  raw: string,
  resolve: ResolveHost = resolveHostWithDns,
): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "주소 형식 오류" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "http/https가 아닌 주소" };
  }
  if (url.username || url.password) return { ok: false, reason: "계정 정보가 든 주소" };
  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, reason: "허용하지 않는 포트" };
  }

  const host = stripBrackets(url.hostname.toLowerCase());
  if (
    !host ||
    host === "localhost" ||
    /\.(localhost|local|internal)\.?$/.test(host) ||
    !host.includes(".")
  ) {
    return { ok: false, reason: "내부 주소" };
  }
  if (isIP(host)) {
    return isBlockedIp(host) ? { ok: false, reason: "사설·예약 IP 주소" } : { ok: true, url };
  }

  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    return { ok: false, reason: "주소를 찾을 수 없음" };
  }
  if (addresses.length === 0 || addresses.some(isBlockedIp)) {
    return { ok: false, reason: "사설·예약 IP로 연결되는 주소" };
  }
  return { ok: true, url };
}
