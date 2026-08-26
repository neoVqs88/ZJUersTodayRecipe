import Mock from './WxMock';
import homeMock from './home/index';
import searchMock from './search/index';
import dataCenter from './dataCenter/index';
import my from './my/index';

export default () => {
  // 在这里添加新的mock数据
  const mockData = [...homeMock, ...searchMock, ...dataCenter, ...my];
  mockData.forEach((item) => {
    Mock.mock(item.path, { code: 200, success: true, data: item.data });
  });
};
