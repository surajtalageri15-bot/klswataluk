const { closeDb, initDb, upsertDistrictPresidentUsers } = require("../db");

const password = process.env.DISTRICT_PRESIDENT_PASSWORD;

if (!password) {
  console.error("DISTRICT_PRESIDENT_PASSWORD is required.");
  console.error("Example: DISTRICT_PRESIDENT_PASSWORD='StrongPasswordHere' npm run seed:district-presidents");
  process.exit(1);
}

async function main() {
  await initDb();
  const users = await upsertDistrictPresidentUsers(password);
  console.log(`Created/updated ${users.length} District President logins.`);
  console.log("Username format: president_<district_name>");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
