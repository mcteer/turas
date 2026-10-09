import { beforeEach } from "vitest";
import { withPartnerDatabase } from "./environment";
beforeEach(()=>withPartnerDatabase(db=>db.query("DELETE FROM partner_rate_windows WHERE environment_id=$1",[process.env.TURAS_TEST_ENVIRONMENT_ID])));
