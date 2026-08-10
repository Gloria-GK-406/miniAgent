# Schema contracts

MiniAgent treats each exported Zod Schema as the executable source of truth for
its corresponding TypeScript type. Public types use `z.infer`, `z.input`, or
`z.output`; a handwritten structure must not be attached to a Schema with a
`z.ZodType` assertion.

## Data Schemas

Data Schemas describe the complete value with Zod data combinators such as
`z.object`, `z.union`, `z.enum`, arrays, records, intersections, and transforms.
They may clone, strip, default, coerce, or transform values according to normal
Zod semantics. Options, request/response values, component Props, persisted
records, and discriminated variants belong here even when a field is a callback.

```typescript
const RequestSchema = z.object({
  path: z.string(),
  onComplete: createFunctionSchema<() => void>().optional(),
});
export type Request = z.infer<typeof RequestSchema>;
```

Do not use `z.custom<{ ... }>()` for data. It does not describe or validate the
advertised fields.

## Protocol Schemas

Protocol Schemas describe identity-bearing services, stateful components, and
objects whose methods depend on their original receiver. Use
`createProtocolSchema` with a real Zod shape. It validates the required members
but returns the exact input object, so class prototypes, private state, and
method receivers remain intact.

```typescript
const StoreSchema = createProtocolSchema({
  read: createFunctionSchema<(path: string) => Promise<string>>(),
});
```

Do not use `z.object` for an identity-bearing protocol: Zod object parsing
returns a projected object rather than the original instance.

## Opaque-object Schemas

Use `z.instanceof(ExternalClass)` when the runtime class is available. Otherwise
use `z.custom<T>(predicate)` only with a real predicate that establishes the
opaque contract. A generic argument alone performs no validation.

```typescript
const ClientSchema = z.instanceof(ExternalClient);
const HandleSchema = z.custom<Handle>(isHandle);
```

## Function Schemas

Use `createFunctionSchema<Signature>()` for callbacks and standalone functions.
It rejects non-functions and returns a valid callable unchanged. A containing
Options or Props object is still a Data Schema unless the object itself has an
identity-bearing protocol role.

## Enforcement

The Schema policy rejects exported handwritten declarations, `as z.ZodType`
contract laundering, predicate-free `z.custom`, and structural type literals
inside `z.custom`. Runtime contract tests cover invalid values and identity.
Tool arguments are parsed by their declared parameter Schema before approval or
execution, and the parsed output is shared by both consumers.
