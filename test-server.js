require('dotenv').config();
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_aW50ZW50LWJyZWFtLTE1OTcuY2xlcmsuYWNjb3VudHMuZGV2JA';
process.env.CLERK_SECRET_KEY = 'sk_test_123';
require('./server');
