const bcrypt = require('bcryptjs');
async function test() {
  try {
    const valid = await bcrypt.compare('Password@123', 'clerk_managed');
    console.log("Valid:", valid);
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
test();
