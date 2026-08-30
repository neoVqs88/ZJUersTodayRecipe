export const AGREEMENT_VERSION = '1.0';
export const PRIVACY_VERSION = '1.0';
export const LEGAL_EFFECTIVE_DATE = '2026年8月30日';
export const OPERATOR_NAME = 'zjuer 今天吃什么项目团队';
export const CONTACT_CHANNEL = '小程序“我的—意见反馈”入口';

export function getLegalConsent() {
  return {
    agreementVersion: AGREEMENT_VERSION,
    privacyVersion: PRIVACY_VERSION,
  };
}
