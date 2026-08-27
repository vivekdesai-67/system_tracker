const ejs = require('ejs');
try {
  ejs.renderFile('views/login.ejs', { error: 'Server error. Please try again.' }, (err, str) => {
    if (err) console.error("RENDER ERROR:", err);
    else console.log("RENDER SUCCESS");
  });
} catch(e) { console.error(e); }
