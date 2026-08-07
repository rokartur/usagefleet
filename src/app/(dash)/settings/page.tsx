import { ActionForm } from "@/components/ActionForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { updateCacheTtl, updateMaxDevices, updateMaxGroups } from "@/lib/actions";
import { ensureSettings, listDevices, listGroups } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, groups, devices] = await Promise.all([
    ensureSettings(user.id),
    listGroups(user.id),
    listDevices(user.id),
  ]);
  const activeDevices = devices.filter((d) => !d.revoked).length;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Account limits</CardTitle>
          <CardDescription>
            How many groups and devices this account may hold. Lowering a cap never breaks what
            already exists — it only blocks new ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <ActionForm
              action={updateMaxGroups}
              loadingMessage="Saving group limit…"
              successMessage="Group limit saved"
            >
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="maxGroups">Groups per account</FieldLabel>
                  <FieldDescription>
                    Each group is budgeted 1/{settings.maxGroups} of the account limit. Currently
                    using {groups.length}.
                  </FieldDescription>
                </FieldContent>
                <div className="flex items-center gap-2">
                  {/* Keyed so a save that clamps the value (or any other
                      revalidation) remounts the field on the stored number
                      instead of leaving the typed one on screen. */}
                  <Input
                    key={settings.maxGroups}
                    id="maxGroups"
                    name="maxGroups"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={settings.maxGroups}
                    className="w-20"
                  />
                  <Button type="submit" variant="outline">
                    Save
                  </Button>
                </div>
              </Field>
            </ActionForm>

            <FieldSeparator />

            <ActionForm
              action={updateMaxDevices}
              loadingMessage="Saving device limit…"
              successMessage="Device limit saved"
            >
              <Field orientation="responsive">
                <FieldContent>
                  <FieldLabel htmlFor="maxDevices">Devices per account</FieldLabel>
                  <FieldDescription>
                    Revoked devices don&apos;t count toward the limit. Currently {activeDevices}{" "}
                    active.
                  </FieldDescription>
                </FieldContent>
                <div className="flex items-center gap-2">
                  <Input
                    key={settings.maxDevices}
                    id="maxDevices"
                    name="maxDevices"
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={settings.maxDevices}
                    className="w-20"
                  />
                  <Button type="submit" variant="outline">
                    Save
                  </Button>
                </div>
              </Field>
            </ActionForm>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Assumptions used to estimate cost at public API list prices — which also decides how
            each group&apos;s share of a limit is split.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={updateCacheTtl}
            loadingMessage="Saving pricing settings…"
            successMessage="Pricing settings saved"
          >
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="cacheWriteTtl">Cache-write TTL</FieldLabel>
                <FieldDescription>
                  Rate used to price cache writes. Claude Code writes 1h caches by default.
                </FieldDescription>
              </FieldContent>
              <div className="flex items-center gap-2">
                <NativeSelect
                  key={settings.cacheWriteTtl}
                  id="cacheWriteTtl"
                  name="cacheWriteTtl"
                  defaultValue={settings.cacheWriteTtl}
                >
                  <NativeSelectOption value="1h">1h (2× input)</NativeSelectOption>
                  <NativeSelectOption value="5m">5m (1.25× input)</NativeSelectOption>
                </NativeSelect>
                <Button type="submit" variant="outline">
                  Save
                </Button>
              </div>
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
