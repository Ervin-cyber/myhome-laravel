import { redirect } from "next/navigation";

export default function NotFound() {
  return (
    redirect("/") // Redirect all requests to the homepage
  );
}