/** 이용약관·개인정보 처리방침 공통 틀 */
export function LegalDocument({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">시행일 {effectiveDate}</p>
      <div className="mt-8 space-y-8 leading-7 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_table]:mt-3 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-line [&_td]:p-2 [&_td]:align-top [&_th]:border [&_th]:border-line [&_th]:bg-paper [&_th]:p-2 [&_th]:text-left [&_ul]:mt-2">
        {children}
      </div>
    </main>
  );
}
