const { Types } = require('mongoose');
const Task = require('../models/Task');

const dayMs = 24 * 60 * 60 * 1000;
const condition = (test) => ({ $cond: [test, 1, 0] });

async function taskOverview(filter, userId, dayStart) {
    const assigneeId = new Types.ObjectId(userId);
    const withDate = { $eq: [{ $type: '$dueDate' }, 'date'] };
    const overdue = { $and: [withDate, { $lt: ['$dueDate', dayStart] }, { $ne: ['$status', 'done'] }] };
    const before = (deadline) => ({ $and: [withDate, { $lt: ['$dueDate', deadline] }] });
    const tomorrow = new Date(+dayStart + dayMs);
    const nextThreeDays = new Date(+dayStart + 4 * dayMs);

    const [summary] = await Task.aggregate([
        { $match: { ...filter, status: { $ne: 'archived' } } },
        { $project: { title: 1, status: 1, priority: 1, assigneeId: 1, dueDate: 1,
            activity: { $slice: [{ $ifNull: ['$activity', []] }, -8] } } },
        { $facet: {
            statistics: [{ $group: {
                _id: null,
                total: { $sum: 1 },
                done: { $sum: condition({ $eq: ['$status', 'done'] }) },
                inProgress: { $sum: condition({ $eq: ['$status', 'in-progress'] }) },
                overdue: { $sum: condition(overdue) }
            } }],
            upcoming: [
                { $match: { assigneeId, status: { $ne: 'done' } } },
                { $set: { rank: { $switch: {
                    branches: [
                        { case: overdue, then: 0 },
                        { case: before(tomorrow), then: 1 },
                        { case: { $eq: ['$status', 'blocked'] }, then: 2 },
                        { case: before(nextThreeDays), then: 3 },
                        { case: { $in: ['$priority', ['critical', 'high']] }, then: 4 },
                        { case: withDate, then: 5 }
                    ],
                    default: 6
                } }, priorityOrder: { $indexOfArray: [['critical', 'high', 'medium', 'low'], { $ifNull: ['$priority', 'medium'] }] } } },
                { $sort: { rank: 1, priorityOrder: 1, dueDate: 1, _id: 1 } },
                { $limit: 6 },
                { $project: { title: 1, status: 1, priority: 1, dueDate: 1, rank: 1 } }
            ],
            activity: [
                { $unwind: '$activity' },
                { $sort: { 'activity.createdAt': -1, _id: -1 } },
                { $limit: 8 },
                { $project: { _id: 0, taskId: '$_id', taskTitle: '$title', action: '$activity.action',
                    username: '$activity.username', createdAt: '$activity.createdAt' } }
            ]
        } }
    ]);
    const { total = 0, done = 0, inProgress = 0, overdue: late = 0 } = summary?.statistics[0] || {};
    return { stats: { total, done, inProgress, overdue: late, rate: total ? Math.round(done * 100 / total) : 0 },
        upcoming: summary?.upcoming || [], activity: summary?.activity || [] };
}

module.exports = taskOverview;
