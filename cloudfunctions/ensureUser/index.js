const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS_COLLECTION = 'users';

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function getUserId(openid) {
  return crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32);
}

function getProfileUpdates(profile = {}) {
  const name = cleanText(profile.nickName || profile.name, 30);
  const image = cleanText(profile.avatarUrl || profile.image, 500);
  const updates = {};
  if (name) updates.name = name;
  if (image) updates.image = image;
  return updates;
}

function cleanEnum(value, allowed, fallback = '') {
  return allowed.includes(value) ? value : fallback;
}

function getEditableProfile(profile = {}) {
  const name = cleanText(profile.name || profile.nickName, 20);
  const image = cleanText(profile.image || profile.avatarUrl, 500);
  const introduction = cleanText(profile.introduction, 80);
  const campus = cleanEnum(profile.campus, ['玉泉校区', '紫金港校区', '西溪校区', '华家池校区', '之江校区', '舟山校区', '海宁校区', '其他']);
  const gender = cleanEnum(profile.gender, ['保密', '男', '女'], '保密');
  const grade = cleanEnum(profile.grade, ['保密', '本科生', '硕士生', '博士生', '教职工', '校友'], '保密');
  const college = cleanText(profile.college, 30);
  const hometown = cleanText(profile.hometown, 30);
  const foodPreferences = Array.isArray(profile.foodPreferences)
    ? Array.from(new Set(profile.foodPreferences.map((item) => cleanText(item, 10)).filter(Boolean))).slice(0, 6)
    : [];

  return {
    ...(name ? { name } : {}),
    ...(image ? { image } : {}),
    introduction,
    campus: campus || '玉泉校区',
    gender,
    grade,
    college,
    hometown,
    foodPreferences,
  };
}

function toPublicUser(user) {
  return {
    id: user._id,
    name: user.name || 'zjuer_新同学',
    image: user.image || '/static/miniprogram-icon-zju-bowl-144.png',
    campus: user.campus || '玉泉校区',
    city: user.city || '杭州',
    star: user.star || '浙江大学生',
    introduction: user.introduction || '',
    gender: user.gender || '保密',
    grade: user.grade || '保密',
    college: user.college || '',
    hometown: user.hometown || '',
    foodPreferences: Array.isArray(user.foodPreferences) ? user.foodPreferences : [],
    checkInCount: user.checkInCount || 0,
    postCount: user.postCount || 0,
    favoriteCount: user.favoriteCount || 0,
    weeklyCheckIns: user.weeklyCheckIns || [false, false, false, false, false, false, false],
    streakDays: user.streakDays || 0,
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
  };
}

function toPublicProfile(user) {
  const profile = toPublicUser(user);
  return {
    id: profile.id,
    name: profile.name,
    image: profile.image,
    campus: profile.campus,
    star: profile.star,
    introduction: profile.introduction,
    gender: profile.gender,
    grade: profile.grade,
    college: profile.college,
    hometown: profile.hometown,
    foodPreferences: profile.foodPreferences,
    checkInCount: profile.checkInCount,
    postCount: profile.postCount,
    favoriteCount: profile.favoriteCount,
  };
}

async function readUser(userId) {
  try {
    const result = await db.collection(USERS_COLLECTION).doc(userId).get();
    return result.data || null;
  } catch (error) {
    const message = error.errMsg || error.message || '';
    if (error.errCode === -1 || /does not exist|not exist|不存在/i.test(message)) return null;
    throw error;
  }
}

function cleanUserId(value) {
  const userId = String(value || '').trim();
  return /^[a-f0-9]{32}$/.test(userId) ? userId : '';
}

async function getPublicProfile(event, currentUserId) {
  const userId = cleanUserId(event.userId);
  if (!userId) return { success: false, code: 'INVALID_USER_ID', message: '用户信息无效' };
  const user = await readUser(userId);
  if (!user || user.status !== 'active') {
    return { success: false, code: 'USER_NOT_FOUND', message: '该用户暂未完善个人主页' };
  }
  return { success: true, user: toPublicProfile(user), isMine: userId === currentUserId };
}

async function updateProfile(event, currentUserId) {
  const existingUser = await readUser(currentUserId);
  if (!existingUser || existingUser.status !== 'active') {
    return { success: false, code: 'LOGIN_REQUIRED', message: '请先登录后再编辑资料' };
  }
  const updates = getEditableProfile(event.profile);
  if (!updates.name) return { success: false, code: 'INVALID_NAME', message: '昵称不能为空' };

  await db.collection(USERS_COLLECTION).doc(currentUserId).update({
    data: {
      ...updates,
      profileCompleted: Boolean(updates.name && updates.introduction),
      updatedAt: db.serverDate(),
    },
  });
  const user = await readUser(currentUserId);
  return { success: true, user: toPublicUser(user), isMine: true };
}

exports.main = async (event = {}) => {
  try {
    const context = cloud.getWXContext();
    if (!context.OPENID) {
      return { success: false, message: '无法获取当前微信用户身份' };
    }

    const userId = getUserId(context.OPENID);
    if (event.action === 'getProfile') return await getPublicProfile(event, userId);
    if (event.action === 'updateProfile') return await updateProfile(event, userId);

    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const existingUser = await readUser(userId);
    const profileUpdates = getProfileUpdates(event.profile);
    const loginMethod = ['wechat', 'sms', 'restore'].includes(event.loginMethod)
      ? event.loginMethod
      : 'wechat';

    if (!existingUser) {
      await userRef.set({
        data: {
          _openid: context.OPENID,
          ...profileUpdates,
          name: profileUpdates.name || 'zjuer_新同学',
          image: profileUpdates.image || '/static/miniprogram-icon-zju-bowl-144.png',
          campus: '玉泉校区',
          city: '杭州',
          star: '浙江大学生',
          introduction: '',
          gender: '保密',
          grade: '保密',
          college: '',
          hometown: '',
          foodPreferences: [],
          status: 'active',
          loginMethods: [loginMethod],
          checkInCount: 0,
          postCount: 0,
          favoriteCount: 0,
          weeklyCheckIns: [false, false, false, false, false, false, false],
          streakDays: 0,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
          lastLoginAt: db.serverDate(),
        },
      });
    } else {
      const loginMethods = Array.from(new Set([...(existingUser.loginMethods || []), loginMethod]));
      await userRef.update({
        data: {
          ...profileUpdates,
          loginMethods,
          status: 'active',
          updatedAt: db.serverDate(),
          lastLoginAt: db.serverDate(),
        },
      });
    }

    const user = await readUser(userId);
    return {
      success: true,
      isNewUser: !existingUser,
      user: toPublicUser(user),
    };
  } catch (error) {
    const message = error.errMsg || error.message || '云端用户初始化失败';
    const collectionMissing = /collection.*not exist|集合.*不存在|-502005/i.test(message);
    return {
      success: false,
      message: collectionMissing ? '请先在云开发数据库中创建 users 集合' : message,
    };
  }
};
