require("dotenv").config();

const path = require("path");
const { createApp } = require("./server/app");

const PORT = Number(process.env.PORT) || 8000;
const databasePath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(__dirname, "data", "src-awards.sqlite");
const { app } = createApp({ databasePath });

const server = app.listen(PORT, () => {
  console.log(`SRC Digital Hub running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.APP_ENV || process.env.NODE_ENV || "development"}.`);
  console.log(`Payment provider: ${process.env.PAYMENT_PROVIDER || (process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_") ? "paystack_test" : "simulation")}.`);
  console.log(process.env.ADMIN_PASSWORD ? "Admin login is configured." : "Admin login is disabled until ADMIN_PASSWORD is set.");
  console.log(process.env.PUBLICITY_ADMIN_PASSWORD ? "Publicity Admin is configured." : "Publicity Admin is not configured.");
  console.log(process.env.STUDENT_AFFAIRS_ADMIN_PASSWORD ? "Student Affairs Admin is configured." : "Student Affairs Admin is not configured.");
  console.log(process.env.AWARDS_ADMIN_PASSWORD ? "Awards Admin is configured." : "Awards Admin is not configured.");
  console.log(process.env.CONTENT_EDITOR_PASSWORD ? "Content Editor is configured." : "Content Editor is not configured.");
});

server.on("error", error => {
  console.error(error.code === "EADDRINUSE" ? `Port ${PORT} is already in use.` : error);
  process.exitCode = 1;
});
