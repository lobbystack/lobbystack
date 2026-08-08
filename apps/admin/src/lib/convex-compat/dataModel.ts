export type TableNames =
  | "businesses"
  | "calls"
  | "contacts"
  | "inbox_items"
  | "users"
  | "messages"
  | "conversations"
  | "appointments"
  | "knowledge_documents";

export type Id<TableName extends TableNames | string = string> = string & {
  __tableName: TableName;
};

export type Doc<TableName extends TableNames | string = string> = {
  _id: Id<TableName>;
  _creationTime: number;
} & Record<string, unknown>;
