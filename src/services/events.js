const { getUpcomingEvents: getEventsFromDb } = require('../data/events');

async function getUpcomingEvents(pool) {
  return await getEventsFromDb(pool);
}

module.exports = { getUpcomingEvents };
