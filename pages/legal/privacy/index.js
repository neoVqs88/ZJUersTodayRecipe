import {
  CONTACT_CHANNEL,
  LEGAL_EFFECTIVE_DATE,
  OPERATOR_NAME,
  PRIVACY_VERSION,
} from '~/config/legal';

Page({
  data: {
    version: PRIVACY_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    operatorName: OPERATOR_NAME,
    contactChannel: CONTACT_CHANNEL,
  },
});
