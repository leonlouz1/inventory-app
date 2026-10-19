CREATE TABLE "upc_groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "upc_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "upc_assignments" ADD COLUMN "group_id" INTEGER;
