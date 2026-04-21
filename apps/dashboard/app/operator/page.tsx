import { isDashboardSessionActive } from "../lib/operator-auth";
import { DashboardClient } from "../ui/dashboard-client";
import { DashboardLogin } from "../ui/dashboard-login";

export default async function OperatorPage() {
  if (!(await isDashboardSessionActive())) {
    return <DashboardLogin />;
  }

  return <DashboardClient />;
}
