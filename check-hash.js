const bcrypt = require('bcryptjs');
async function test() {
    const p1 = await bcrypt.compare('Password@123', '$2b$10$2VrfP2pPwe0tmMYeerWggemtaAh/8auAexuVfeIkktqUiA3fYLnLK');
    const p2 = await bcrypt.compare('Password@123', '$2b$10$oh5Qo1mqG/INk5FMMdspcuU/8HuDNVxjR49PgO0bD770SO.SkM4E.');
    console.log('admin match:', p1);
    console.log('vivek match:', p2);
}
test();
