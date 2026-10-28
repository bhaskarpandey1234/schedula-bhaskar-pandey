import { LoadingState } from "@/components/states/loading-state";
import { PageContainer } from "@/components/layout/page-container";

export default function Loading() { return <PageContainer className="py-8"><LoadingState label="Loading appointments" /></PageContainer>; }
