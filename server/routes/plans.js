const express = require('express');
const router = express.Router();
const Plan = require('../models/Plan');

router.get('/', async (req, res) => {
    const plans = await Plan.find();
    res.json(plans);
});

module.exports = router;