exports.up = pgm => {
    pgm.addColumn('queue_requests', {
        call_type: {
            type: 'text',
            notNull: false
        }
    }, { ifNotExists: true });
};

exports.down = pgm => {
    pgm.dropColumn('queue_requests', 'call_type', { ifExists: true });
};
