type Schema = Record<string, unknown>;
const formats = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);
const bounds = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "uniqueItems"];
const record = (value: unknown): value is Schema => !!value && typeof value === "object" && !Array.isArray(value);
const never = (value: unknown) => value === false || record(value) && record(value.not) && Object.keys(value.not).length === 0;

/** Support's transport grammar is a projection, never its output validator.
 * Keep the original Zod/domain checks after generation. Claude's structured
 * output subset excludes bounds and advanced regex; descriptions carry those
 * instructions while the server still enforces them.
 * https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations
 */
export function supportProviderSchema<T extends object>(schema: T): T {
  const projected = structuredClone(schema);
  function visit(node: Schema) {
    const serverConstraints: Schema = {};
    const describe = (key: string) => { serverConstraints[key] = node[key]; delete node[key]; };
    for (const key of bounds) if (key in node) describe(key);
    if ("minItems" in node && node.minItems !== 0 && node.minItems !== 1) describe("minItems");
    if (typeof node.format === "string" && !formats.has(node.format)) describe("format");
    // Preserve Support's fixed-repeat UUID/date patterns. Conservatively leave
    // advanced groups, backreferences, boundaries and ranges to server checks.
    if (typeof node.pattern === "string" && /\(\?|\\[1-9bB]|\{\d+,\d*\}/.test(node.pattern)) describe("pattern");
    if (Array.isArray(node.oneOf)) { node.anyOf = node.oneOf; delete node.oneOf; }
    if (record(node.properties)) {
      const required = Array.isArray(node.required) ? node.required : [];
      for (const [key, value] of Object.entries(node.properties)) {
        if (never(value)) {
          if (required.includes(key)) throw new Error("Support provider schema cannot require a forbidden property");
          delete node.properties[key];
        } else if (record(value)) visit(value);
      }
    }
    for (const key of ["$defs", "definitions"]) if (record(node[key]))
      for (const value of Object.values(node[key])) if (record(value)) visit(value);
    for (const key of ["anyOf", "allOf"]) if (Array.isArray(node[key]))
      for (const value of node[key]) if (record(value)) visit(value);
    if (record(node.items)) visit(node.items);
    if (Object.keys(serverConstraints).length)
      node.description = `${typeof node.description === "string" ? node.description + "\n" : ""}Server validation: ${JSON.stringify(serverConstraints)}`;
  }
  visit(projected as Schema);
  return projected;
}
