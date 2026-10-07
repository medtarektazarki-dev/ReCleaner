import { createFileRoute } from "@tanstack/react-router";
import { RecleanerApp } from "@/components/recleaner/app";
import { getHostProfile } from "@/lib/recleaner/actions";

export const Route = createFileRoute("/")({
  loader: () => getHostProfile(),
  component: Home,
});

function Home() {
  const initial = Route.useLoaderData();
  return <RecleanerApp initial={initial} />;
}
