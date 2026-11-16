const express = require('express');
const router = express.Router();
const Plan = require('../models/Plan');

router.get('/', async (req, res) => {
    const plans = await Plan.find({ isActive: { $ne: false } })
        .select('name maxMembers maxProjects maxFolders').sort({ price: 1 }).lean();
    res.json(plans);
});

module.exports = router;
