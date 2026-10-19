import { useEffect, useState } from "react";
import { productFieldsApi } from "../api/inventory";

// Category field setup is shared by every form, so load it once per page visit.
let fieldsPromise = null;

export function loadFields() {
  if (!fieldsPromise) {
    fieldsPromise = productFieldsApi.list().catch((err) => {
      fieldsPromise = null;
      throw err;
    });
  }
  return fieldsPromise;
}

// After adding a dropdown option, so other forms see it without reloading.
export function cacheFields(fields) {
  fieldsPromise = Promise.resolve(fields);
}

// Keys of the fields `category` requires, e.g. for forms with their own inputs.
export function useRequiredFieldKeys(category) {
  const [fields, setFields] = useState([]);
  useEffect(() => {
    let active = true;
    loadFields().then((f) => { if (active) setFields(f); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return new Set(fields.filter((f) => f.categories?.[category] === "required").map((f) => f.key));
}
