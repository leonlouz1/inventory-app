CREATE TABLE "upc_codes" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "code" VARCHAR(2) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    CONSTRAINT "upc_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "upc_codes_kind_code_key" ON "upc_codes"("kind", "code");

CREATE TABLE "upc_assignments" (
    "sku" VARCHAR(5) NOT NULL,
    "in_use" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "upc_assignments_pkey" PRIMARY KEY ("sku")
);

INSERT INTO "upc_codes" ("kind", "code", "name") VALUES
    ('brand', '24', 'JetSet'),
    ('brand', '25', 'JetEase'),
    ('brand', '26', 'Catherine Malandrino'),
    ('brand', '27', 'Leluxe Travel')
ON CONFLICT DO NOTHING;
