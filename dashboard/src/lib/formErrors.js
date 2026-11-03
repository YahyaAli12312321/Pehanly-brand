import { errorMessage } from "./apiError";

/**
 * Map a 422 (or any) error onto form fields.
 * Backend: { errors: [{ path: "a.b", message }] } or { errors: { field: "msg" } }; ApiError.fieldErrors normalises it.
 * Returns { fields: {path: message}, general: string }.
 */
export function splitFormError(err, fallback = "Something went wrong") {
  const fields = err?.fieldErrors && typeof err.fieldErrors === "object" ? { ...err.fieldErrors } : {};
  const hasFields = Object.keys(fields).length > 0;
  return { fields, general: hasFields ? "Please fix the highlighted fields." : errorMessage(err, fallback) };
}
