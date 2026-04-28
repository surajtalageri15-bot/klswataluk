const { closeDb, initDb, upsertStatePresidentUser } = require("../db");

const password = process.env.STATE_PRESIDENT_PASSWORD;

if (!password) {
  console.error("STATE_PRESIDENT_PASSWORD is required.");
  console.error("Example: STATE_PRESIDENT_PASSWORD='StrongPasswordHere' npm run seed:state-president");
  process.exit(1);
}

(async () => {
  await initDb();
  const user = await upsertStatePresidentUser(password);
  console.log("Created/updated State President login.");
  console.log(`Username: ${user.username}`);
  await closeDb();
})().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
