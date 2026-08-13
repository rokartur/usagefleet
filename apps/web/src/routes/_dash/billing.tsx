import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { CheckIcon } from "lucide-react";
import { BillingPortalButton, SubscribeButton } from "@/components/billing/BillingButtons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { accountPlan } from "@/lib/billing";
import { listDevices } from "@/lib/data";
import { FREE_DEVICES, PAID_PLANS, PLANS, planLabel } from "@/lib/plans";
import { requireUser } from "@/lib/session";

const DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

const billingData = createServerFn().handler(async () => {
  const user = await requireUser();
  const [plan, devices] = await Promise.all([accountPlan(user.id), listDevices(user.id)]);
  return { plan, activeDevices: devices.filter((d) => !d.revoked).length };
});

export const Route = createFileRoute("/_dash/billing")({
  loader: () => billingData(),
  component: BillingPage,
});

function BillingPage() {
  const { plan, activeDevices } = Route.useLoaderData();
  const subscribed = plan.plan !== "free";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {planLabel(plan.plan)}
            {plan.status === "past_due" && <Badge variant="destructive">Payment failed</Badge>}
            {plan.cancelAtPeriodEnd && <Badge variant="secondary">Cancels at period end</Badge>}
          </CardTitle>
          <CardDescription>
            <span className="tabular-nums">
              {activeDevices} / {plan.deviceLimit}
            </span>{" "}
            active devices in use.
            {plan.periodEnd &&
              ` ${plan.cancelAtPeriodEnd ? "Ends" : "Renews"} ${DATE.format(plan.periodEnd)}.`}
          </CardDescription>
        </CardHeader>
        {subscribed && (
          <CardContent>
            <BillingPortalButton />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>
            Billed monthly, cancel any time. Revoked devices never count toward the cap, and
            dropping to a smaller plan keeps existing devices reporting — it only blocks new ones.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PlanRow
            name="Free"
            devices={FREE_DEVICES}
            price="$0"
            current={plan.plan === "free"}
            action={null}
          />
          {PAID_PLANS.map((id) => (
            <PlanRow
              key={id}
              name={PLANS[id].label}
              devices={PLANS[id].devices}
              price={`$${PLANS[id].priceUsd}`}
              current={plan.plan === id}
              action={
                plan.plan === id ? null : (
                  <SubscribeButton
                    plan={id}
                    label={subscribed ? "Switch" : "Subscribe"}
                    variant={subscribed ? "outline" : "default"}
                  />
                )
              }
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanRow({
  name,
  devices,
  price,
  current,
  action,
}: {
  name: string;
  devices: number;
  price: string;
  current: boolean;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {name}
          {current && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <CheckIcon className="size-3" aria-hidden />
              Current
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {devices} device{devices === 1 ? "" : "s"} · {price}/month
        </p>
      </div>
      {action}
    </div>
  );
}
