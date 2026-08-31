import {
  AGREEMENT_VERSION,
  CONTACT_CHANNEL,
  LEGAL_EFFECTIVE_DATE,
  OPERATOR_NAME,
} from '~/config/legal';

Page({
  data: {
    version: AGREEMENT_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    operatorName: OPERATOR_NAME,
    contactChannel: CONTACT_CHANNEL,
  },
});
