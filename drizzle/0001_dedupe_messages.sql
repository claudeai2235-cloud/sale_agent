DROP INDEX "messages_external";--> statement-breakpoint
CREATE UNIQUE INDEX "messages_tenant_external" ON "messages" USING btree ("tenant_id","external_id") WHERE "messages"."external_id" is not null;