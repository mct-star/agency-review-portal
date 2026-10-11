export function stableJSON(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(stableJSON).join(",")}]`;
 if(value && typeof value==="object")return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJSON((value as Record<string,unknown>)[k])}`).join(",")}}`;
 return JSON.stringify(value) ?? "null";
}
