const ejs = require('ejs');
const fs = require('fs');
const template = fs.readFileSync('views/sign-in.ejs', 'utf8');
const html = ejs.render(template, { publishableKey: 'pk_test_123' }, { filename: 'views/sign-in.ejs' });
console.log(html.match(/<script.*?src=".*?".*?>/)[0]);
