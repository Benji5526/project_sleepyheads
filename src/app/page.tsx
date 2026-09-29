import { Suspense } from "react";
import { AskHome } from "@/components/ask/AskHome";

export default function Home() {
  return (
    <Suspense>
      <AskHome />
    </Suspense>
  );
}
