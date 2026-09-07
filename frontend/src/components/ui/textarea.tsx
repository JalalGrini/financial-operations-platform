/**
 * Re-export shim.
 *
 * `Textarea` is implemented alongside `Input` in `./input`, but three call
 * sites (the sign-in page, admin tickets, and leave requests) import it from
 * `@/components/ui/textarea` - the path the rest of the shadcn convention
 * would predict. That mismatch was a hard build failure in all three files.
 *
 * Re-exporting is the correct fix rather than duplicating the component:
 * there stays exactly one implementation, one set of styles, and one place to
 * change it, while both import paths resolve.
 *
 * Note: `TextareaProps` is declared but not exported by `./input`, so only
 * the component is re-exported here. Consumers that need the prop type can
 * use `ComponentProps<typeof Textarea>`.
 */
export { Textarea } from "./input";
