import "dotenv/config";
import { securityConfig } from "../src/security/config";
import { SecurityStore } from "../src/security/store";
const store = new SecurityStore(securityConfig().database);
store.db.close();
console.log("Admin security schema is ready.");
