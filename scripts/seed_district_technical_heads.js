const { closeDb, initDb, upsertDistrictTechnicalHeadUsers } = require("../db");

const password = process.env.DISTRICT_TECH_HEAD_PASSWORD;

if (!password) {
  console.error("DISTRICT_TECH_HEAD_PASSWORD is required.");
  console.error("Example: DISTRICT_TECH_HEAD_PASSWORD='StrongPasswordHere' npm run seed:district-tech-heads");
  process.exit(1);
}

async function main() {
  await initDb();
  const users = await upsertDistrictTechnicalHeadUsers(password);
  console.log(`Created/updated ${users.length} District Technical Head logins.`);
  console.log("Username format: techhead_<district_name>");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
