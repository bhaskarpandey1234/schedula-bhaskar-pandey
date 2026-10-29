import { PageContainer } from "@/components/layout/page-container";
import { LoadingState } from "@/components/states/loading-state";

export default function Loading() {
  return <PageContainer className="py-8"><LoadingState label="Loading doctors" /></PageContainer>;
}
