import { For, createSignal } from "solid-js";
import { createForm } from "@tanstack/solid-form";
import { TbInfoCircle } from "solid-icons/tb";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetFooter } from "@/components/ui/sheet";
import { showToast } from "@/components/ui/toast";

import {
  Config,
  ConflictResolutionStrategy,
  PermissionFlag,
  RecordApiConfig,
} from "@proto/config";
import { SheetContainer } from "@/components/SafeSheet";
import type { Table, View } from "@/lib/bindings";
import {
  buildTextFormField,
  buildOptionalTextFormField,
} from "@/components/FormFields";
import { createConfigQuery, setConfig } from "@/lib/config";
import { parseSql } from "@/lib/parse";
import { tableType } from "@/lib/schema";

const tablePermissions = {
  Create: PermissionFlag.CREATE,
  Read: PermissionFlag.READ,
  Update: PermissionFlag.UPDATE,
  Delete: PermissionFlag.DELETE,
  Schema: PermissionFlag.SCHEMA,
} as const;

const viewPermissions = {
  Read: PermissionFlag.READ,
  Schema: PermissionFlag.SCHEMA,
} as const;

function AclForm(props: {
  entity: string;
  initial?: PermissionFlag[];
  showHeader: boolean;
  onChange: (v: PermissionFlag[]) => void;
  view: boolean;
}) {
  const [acl, setAcl] = createSignal(new Set(props.initial ?? []));

  return (
    <div class="flex">
      <div
        class="grid items-end gap-2 w-[300px]"
        style="grid-template-columns: auto 1fr 1fr 1fr 1fr 1fr"
      >
        {props.showHeader && (
          <For
            each={Object.keys(props.view ? viewPermissions : tablePermissions)}
          >
            {(key, index) => (
              <div
                class="ml-1 col-span-1 [writing-mode:vertical-rl]"
                style={`grid-column-start: ${index() + 2}`}
              >
                {key}
              </div>
            )}
          </For>
        )}

        <div class="col-start-1 col-span-1 w-[120px]">
          <Label>{props.entity}</Label>
        </div>

        <For
          each={Object.values(props.view ? viewPermissions : tablePermissions)}
        >
          {(perm) => (
            <div class="col-span-1">
              <Checkbox
                checked={acl().has(perm)}
                onChange={(v: boolean) => {
                  const set = acl();
                  if (v) {
                    set.add(perm);
                  } else {
                    set.delete(perm);
                  }

                  setAcl(new Set(set));
                  props.onChange([...set]);
                }}
              />
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

type Field = keyof RecordApiConfig;
interface AccessRule {
  field: Field;
  label: string;
  description: string;
}

const tableAccessRules: AccessRule[] = [
  {
    field: "readAccessRule",
    label: "Read access:",
    description:
      'Row- and request-level read access (_user_, _row_, _req_): If the table has an "owner"\'s column containing binary user ids, access could be rstricted to the owner by setting \'_row_.owner = _user_\' here. Or if the table as a foreign key to a "group" and a relationship defined in a "membership" table: \'(SELECT 1 FROM membership WHERE group = _row_.group AND user = _user_)\'',
  },
  {
    field: "createAccessRule",
    label: "Create access:",
    description:
      "Request-level create access validation base on _USER_, _REQ_:",
  },
  {
    field: "updateAccessRule",
    label: "Update access",
    description:
      "Row- and request level update access based on _USER_, _ROW_, _REQ_:",
  },
  {
    field: "deleteAccessRule",
    label: "Delete Access",
    description:
      "Row- and request level delete access based on _USRE_, _ROW_, _REQ_:",
  },
  {
    field: "schemaAccessRule",
    label: "Schema Access",
    description: "Schema access based on _USER_:",
  },
] as const;

const viewAccessRules: AccessRule[] = [
  {
    field: "readAccessRule",
    label: "Read access:",
    description:
      'Row- and request-level read access (_user_, _row_, _req_): If the table has an "owner"\'s column containing binary user ids, access could be rstricted to the owner by setting \'_row_.owner = _user_\' here. Or if the table as a foreign key to a "group" and a relationship defined in a "membership" table: \'(SELECT 1 FROM membership WHERE group = _row_.group AND user = _user_)\'',
  },
  {
    field: "schemaAccessRule",
    label: "Schema Access",
    description: "Schema access based on _USER_:",
  },
] as const;

function updateRecordApiConfig(
  config: Config,
  recordApiConfig: RecordApiConfig,
): Config {
  const newConfig = Config.fromPartial(config);

  for (const i in newConfig.recordApis) {
    const api = newConfig.recordApis[i];
    if (api.name == recordApiConfig.name) {
      newConfig.recordApis[i] = recordApiConfig;
      return newConfig;
    }
  }

  newConfig.recordApis.push(recordApiConfig);
  return newConfig;
}

function removeRecordApiConfig(config: Config, tableName: string): Config {
  const newConfig = Config.fromPartial(config);

  while (true) {
    const index = newConfig.recordApis.findIndex(
      (api) => api.tableName === tableName,
    );
    if (index < 0) {
      break;
    }

    newConfig.recordApis.splice(index, 1);
  }

  return newConfig;
}

function ConflictResolutionSrategyToString(
  value: ConflictResolutionStrategy | null,
): string {
  switch (value) {
    case ConflictResolutionStrategy.ABORT:
      return "Abort";
    case ConflictResolutionStrategy.ROLLBACK:
      return "Rollback";
    case ConflictResolutionStrategy.FAIL:
      return "Fail";
    case ConflictResolutionStrategy.IGNORE:
      return "Ignore";
    case ConflictResolutionStrategy.REPLACE:
      return "Replace";
    default:
      return "Undefined";
  }
}

function findRecordApi(
  config: Config | undefined,
  tableName: string,
): RecordApiConfig | undefined {
  if (!config) {
    return undefined;
  }

  for (const api of config.recordApis) {
    if (api.tableName == tableName) {
      return api;
    }
  }

  return undefined;
}

export function RecordApiSettingsForm(props: {
  close: () => void;
  markDirty: () => void;
  schema: Table | View;
}) {
  const config = createConfigQuery();

  const type = () => tableType(props.schema);

  // FIXME: We don't currently handle the "multiple APIs for a single table" case.
  const currentApi = () =>
    findRecordApi(config.data!.config!, props.schema.name);

  const form = createForm<RecordApiConfig>(() => {
    const tableName = props.schema.name;
    return {
      defaultValues: currentApi() ?? {
        name: tableName,
        tableName: tableName,
        aclWorld: [],
        aclAuthenticated: [],
      },
      onSubmit: async ({ value }: { value: RecordApiConfig }) => {
        console.debug("Add record api config:", value);

        const c = config.data?.config;
        if (!c) {
          console.error("missing base configuration");
          return;
        }

        const newConfig = updateRecordApiConfig(c, value);
        try {
          await setConfig(newConfig);
          props.close();
        } catch (err) {
          showToast({
            title: "Uncaught Error",
            description: `${err}`,
            variant: "error",
          });
        }
      },
    };
  });

  form.useStore((state) => {
    if (state.isDirty && !state.isSubmitted) {
      props.markDirty();
    }
  });

  return (
    <SheetContainer>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div class="flex flex-col items-start gap-4 py-4">
          <Card class="w-full">
            <CardHeader>
              <CardTitle>Record API Settings</CardTitle>
            </CardHeader>

            <CardContent class="flex flex-col gap-4 my-4">
              <form.Field
                name="name"
                validators={{
                  onChange: ({ value }: { value: string | undefined }) => {
                    return value ? undefined : "Api name missing";
                  },
                }}
              >
                {buildTextFormField({
                  label: () => <div class={labelWidth}>API name</div>,
                })}
              </form.Field>

              {type() === "table" && (
                <>
                  <form.Field name="conflictResolution">
                    {(field) => (
                      <div class="flex items-center gap-2">
                        <Label>Conflict resolution</Label>

                        <Select<ConflictResolutionStrategy>
                          multiple={false}
                          placeholder="Select group..."
                          defaultValue={field().state.value}
                          options={[
                            ConflictResolutionStrategy.ABORT,
                            ConflictResolutionStrategy.ROLLBACK,
                            ConflictResolutionStrategy.FAIL,
                            ConflictResolutionStrategy.IGNORE,
                            ConflictResolutionStrategy.REPLACE,
                          ]}
                          optionValue={ConflictResolutionSrategyToString}
                          onChange={(
                            strategy: ConflictResolutionStrategy | null,
                          ) => {
                            field().handleChange(strategy ?? undefined);
                          }}
                          itemComponent={(props) => (
                            <SelectItem item={props.item}>
                              {ConflictResolutionSrategyToString(
                                props.item.rawValue,
                              )}
                            </SelectItem>
                          )}
                        >
                          <SelectTrigger class="w-[180px]">
                            <SelectValue<ConflictResolutionStrategy>>
                              {(state) =>
                                ConflictResolutionSrategyToString(
                                  state.selectedOption(),
                                )
                              }
                            </SelectValue>
                          </SelectTrigger>

                          <SelectContent />
                        </Select>
                      </div>
                    )}
                  </form.Field>

                  <form.Field
                    name="autofillMissingUserIdColumns"
                    children={(field) => {
                      const HCard = () => (
                        <HoverCard>
                          <HoverCardTrigger
                            class="size-[32px]"
                            as={Button<"button">}
                            variant="link"
                          >
                            <TbInfoCircle />
                          </HoverCardTrigger>

                          <HoverCardContent class="w-80">
                            <div class="flex justify-between space-x-4">
                              <div class="space-y-1">
                                <h4 class="text-sm font-semibold">
                                  User Id Auto-Fill
                                </h4>

                                <p class="text-sm">
                                  When enabled, user id columns that are not
                                  provided as part of a CREATE request will be
                                  auto-filled with the id of the calling user
                                  when authenticated.
                                </p>

                                <p class="text-sm">
                                  For most use-cases this setting should stay
                                  turned-off and user ids should be provided
                                  explicitly by the client. This setting can be
                                  useful in case the client cannot run any logic
                                  like JS-less HTML forms.
                                </p>
                              </div>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      );
                      // TODO: Should be buildBoolFormField?
                      const v = () => field().state.value;
                      return (
                        <div class="flex items-center gap-2 mt-2">
                          <Label>Autofill absent user ids</Label>

                          <HCard />

                          <Checkbox
                            checked={v()}
                            onChange={(v: boolean) => field().handleChange(v)}
                          />
                        </div>
                      );
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card class="w-full">
            <CardHeader>
              <CardTitle>Access</CardTitle>
            </CardHeader>

            <CardContent class="flex flex-col gap-4 my-4">
              <form.Field name="aclWorld">
                {(field) => {
                  const v = field().state.value;
                  return (
                    <div class="mb-4">
                      <AclForm
                        entity="World"
                        showHeader={true}
                        initial={v}
                        onChange={field().handleChange}
                        view={type() === "view"}
                      />
                    </div>
                  );
                }}
              </form.Field>

              <form.Field name="aclAuthenticated">
                {(field) => {
                  const v = field().state.value;
                  return (
                    <div class="mb-4">
                      <AclForm
                        entity="Authenticated"
                        showHeader={false}
                        initial={v}
                        onChange={field().handleChange}
                        view={type() === "view"}
                      />
                    </div>
                  );
                }}
              </form.Field>

              <For
                each={type() === "view" ? viewAccessRules : tableAccessRules}
              >
                {(item) => {
                  async function onChangeAsync(props: {
                    value: string | undefined;
                  }) {
                    const value = props.value;
                    if (value) {
                      console.debug("Query", value);
                      return parseSql(value);
                    }
                  }

                  return (
                    <form.Field
                      name={item.field}
                      validators={{
                        onChangeAsync,
                        onChangeAsyncDebounceMs: 500,
                      }}
                    >
                      {buildOptionalTextFormField({
                        label: () => <div class={labelWidth}>{item.label}</div>,
                      })}
                    </form.Field>
                  );
                }}
              </For>
            </CardContent>
          </Card>
        </div>

        <SheetFooter>
          <Button
            disabled={currentApi() === undefined}
            variant="destructive"
            onClick={() => {
              const tableName = props.schema.name;
              console.debug("Remove record API config for:", tableName);

              const c = config.data?.config;
              if (!c) {
                console.error("missing base configuration");
                return;
              }

              const newConfig = removeRecordApiConfig(c, tableName);
              setConfig(newConfig)
                .then(() => props.close())
                .catch(console.error);
            }}
          >
            Disable
          </Button>

          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {(state) => (
              <Button
                type="submit"
                disabled={!state().canSubmit}
                variant="default"
              >
                {currentApi() ? "Update" : "Enable"}
              </Button>
            )}
          </form.Subscribe>
        </SheetFooter>
      </form>
    </SheetContainer>
  );
}

const labelWidth = "w-[112px]";