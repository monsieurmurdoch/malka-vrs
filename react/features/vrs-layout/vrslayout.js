//features/vrs-layout/vrslayout.js

import React from 'react';
import { connect } from 'react-redux';

const VRSLayout = ({ participants }) => {
    return (
        <div className="vrs-layout">
            <div className="vrs-caller">
                {/* Caller video */}
            </div>
            <div className="vrs-interpreter">
                {/* Interpreter video */}
            </div>
            <div className="vrs-called-party">
                {/* Called party video */}
            </div>
        </div>
    );
};

export default connect(state => ({
    participants: state['features/base/participants']
}))(VRSLayout);
