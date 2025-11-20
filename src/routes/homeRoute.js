const express = require('express');
const router = express.Router();
const homeController = require('../controllers/homeController');

router.get('/customer/home', homeController.getCustomerHome);
router.get('/customer/products', homeController.getCustomerProducts);
router.post('/customer/emergency', homeController.postEmergencyRequest);
router.get('/customer/emergency', homeController.getEmergencyRequests);

module.exports = router;
