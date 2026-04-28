const { closeDb, initDb, upsertDivisionTechnicalTeamUsers } = require("../db");

const password = process.env.DIVISION_TEAM_PASSWORD;

if (!password) {
  console.error("DIVISION_TEAM_PASSWORD is required.");
  console.error("Example: DIVISION_TEAM_PASSWORD='StrongPasswordHere' npm run seed:division-teams");
  process.exit(1);
}

async function main() {
  await initDb();
  const users = await upsertDivisionTechnicalTeamUsers(password);
  console.log(`Created/updated ${users.length} State Division Technical Team logins.`);
  console.log("Usernames: division_bengaluru, division_mysuru, division_belagavi, division_kalaburagi");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
