import React from 'react';
import { connect } from 'react-redux';
import { translate } from '../../../base/i18n/functions';
import AbstractButton, { IProps as AbstractButtonProps } from '../../../base/toolbox/components/AbstractButton';

interface IProps extends AbstractButtonProps {
    isActive: boolean;
}

class ActiveInactiveToggleButton extends AbstractButton<IProps> {
    accessibilityLabel = 'toolbar.activeInactive';
    label = 'Active';
    tooltip = 'Toggle active in queue';
    toggledLabel = 'Inactive';

    _isToggled() {
        return this.props.isActive;
    }

    _handleClick() {
        console.log('Toggle active/inactive');
        // Later, dispatch action
    }
}

function mapStateToProps(state: any) {
    // TODO: Get real state for isActive
    return {
        isActive: false
    };
}

export default translate(connect(mapStateToProps)(ActiveInactiveToggleButton));