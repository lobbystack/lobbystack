export type FunctionType = "query" | "mutation" | "action";

export type FunctionReference<
  Type extends FunctionType = FunctionType,
  Visibility extends "public" | "internal" = "public",
> = {
  readonly _type: Type;
  readonly _visibility: Visibility;
  readonly _path: string;
};

export type FunctionArgs<Reference> = Record<string, unknown>;

export type FunctionReturnType<Reference> = any;
