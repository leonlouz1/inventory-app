// Category-driven attribute schema.
// Each category maps to an array of field definitions.
// Field types: "text" (default), "select"
// A field can have `dependsOn: { field, values }` to only appear when another field matches.

export const CATEGORY_ATTRIBUTES = {
  "Training Pads": [
    { key: "padSize", label: "Pad Size" },
    { key: "packSize", label: "Pack Size" },
    { key: "scent", label: "Scent" },
    { key: "print", label: "Print" },
    { key: "bagColor", label: "Bag Color" },
  ],

  "Travel Pillows": [
    {
      key: "pillowType",
      label: "Pillow Type",
      type: "select",
      options: ["U-Shaped", "Neck Roll", "Rectangular", "Wrap-Around"],
    },
    { key: "color", label: "Color" },
    {
      key: "embossment",
      label: "Embossment",
      dependsOn: { field: "pillowType", values: ["U-Shaped", "Neck Roll"] },
    },
    {
      key: "filling",
      label: "Filling",
      dependsOn: { field: "pillowType", values: ["Rectangular", "Wrap-Around"] },
    },
  ],
};
