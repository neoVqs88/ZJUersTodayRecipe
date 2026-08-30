const crypto = require('crypto');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const { command } = db;
const USERS_COLLECTION = 'users';
const FOLLOWS_COLLECTION = 'follows';
const OWNED_COLLECTIONS = ['mealRecords', 'checkins', 'posts', 'comments', 'browsingHistory', 'messages'];
const ACCOUNT_DELETE_CONFIRMATION = 'DELETE_ACCOUNT';
const DEFAULT_PRIVACY = {
  profileVisibility: 'public',
  activityVisibility: 'public',
  showCheckins: false,
  showFollowing: true,
  showFollowers: true,
  allowFollow: true,
  historyEnabled: true,
};

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

function normalizePrivacy(value = {}) {
  const visibilityOptions = ['public', 'followers', 'private'];
  return {
    profileVisibility: visibilityOptions.includes(value.profileVisibility) ? value.profileVisibility : DEFAULT_PRIVACY.profileVisibility,
    activityVisibility: visibilityOptions.includes(value.activityVisibility) ? value.activityVisibility : DEFAULT_PRIVACY.activityVisibility,
    showCheckins: typeof value.showCheckins === 'boolean' ? value.showCheckins : DEFAULT_PRIVACY.showCheckins,
    showFollowing: typeof value.showFollowing === 'boolean' ? value.showFollowing : DEFAULT_PRIVACY.showFollowing,
    showFollowers: typeof value.showFollowers === 'boolean' ? value.showFollowers : DEFAULT_PRIVACY.showFollowers,
    allowFollow: typeof value.allowFollow === 'boolean' ? value.allowFollow : DEFAULT_PRIVACY.allowFollow,
    historyEnabled: typeof value.historyEnabled === 'boolean' ? value.historyEnabled : DEFAULT_PRIVACY.historyEnabled,
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
    privacy: normalizePrivacy(user.privacy),
    createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null,
  };
}

function isMissingCollection(error) {
  const message = error.errMsg || error.message || '';
  return /collection.*not exist|集合.*不存在|-502005/i.test(message);
}

async function removeWhere(collectionName, condition) {
  try {
    await db.collection(collectionName).where(condition).remove();
  } catch (error) {
    if (!isMissingCollection(error)) throw error;
  }
}

async function deleteMealImages(userId) {
  try {
    const fileList = [];
    for (let page = 0; page < 10; page += 1) {
      // 分页查询必须按顺序执行，才能根据当前页判断是否结束。
      // eslint-disable-next-line no-await-in-loop
      const result = await db.collection('mealRecords').where({ userId }).skip(page * 100).limit(100).get();
      fileList.push(...result.data.map((item) => item.imageFileId).filter((fileID) => /^cloud:\/\//.test(fileID)));
      if (result.data.length < 100) break;
    }
    for (let index = 0; index < fileList.length; index += 50) {
      // 云存储批量删除按批次执行，避免一次请求超出文件数量限制。
      // eslint-disable-next-line no-await-in-loop
      await cloud.deleteFile({ fileList: fileList.slice(index, index + 50) });
    }
  } catch (error) {
    if (!isMissingCollection(error)) console.warn('删除打卡图片失败，将继续注销账号', error);
  }
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

async function validateSession(userId) {
  const user = await readUser(userId);
  if (!user) return { success: false, code: 'SESSION_INVALID', message: '登录状态已失效，请重新登录' };
  if (user.status === 'deleted' || user.status === 'deleting') {
    return { success: false, code: 'ACCOUNT_DELETED', message: '该账号已注销' };
  }
  if (user.status !== 'active') {
    return { success: false, code: 'USER_DISABLED', message: '账号当前不可用，请联系管理员' };
  }
  return { success: true, user: toPublicUser(user) };
}

async function deleteAccount(event, context, userId) {
  if (event.confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
    return { success: false, code: 'CONFIRMATION_REQUIRED', message: '请再次确认注销账号' };
  }
  const user = await readUser(userId);
  if (!user || user.status === 'deleted') return { success: true, deleted: true, deletionVersion: 1 };
  if (user.status !== 'active' && user.status !== 'deleting') {
    return { success: false, code: 'USER_DISABLED', message: '账号当前不可注销，请联系管理员' };
  }

  const userRef = db.collection(USERS_COLLECTION).doc(userId);
  await userRef.update({ data: { status: 'deleting', updatedAt: db.serverDate() } });
  try {
    await deleteMealImages(userId);
    await Promise.all(OWNED_COLLECTIONS.map((collectionName) => removeWhere(collectionName, {
      _openid: context.OPENID,
    })));
    await Promise.all([
      removeWhere('mealRecords', { userId }),
      removeWhere('checkins', { userId }),
      removeWhere('posts', { userId }),
      removeWhere('posts', { authorId: userId }),
      removeWhere('posts', { user_id: userId }),
      removeWhere('comments', { userId }),
      removeWhere('browsingHistory', { userId }),
      removeWhere('messages', { actorUserId: userId }),
      removeWhere(FOLLOWS_COLLECTION, { followerId: userId }),
      removeWhere(FOLLOWS_COLLECTION, { followingId: userId }),
    ]);

    await userRef.update({
      data: {
        name: '已注销用户',
        image: '/static/miniprogram-icon-zju-bowl-144.png',
        introduction: '',
        gender: '保密',
        grade: '保密',
        college: '',
        hometown: '',
        foodPreferences: [],
        privacy: {
          profileVisibility: 'private',
          activityVisibility: 'private',
          showCheckins: false,
          showFollowing: false,
          showFollowers: false,
          allowFollow: false,
          historyEnabled: false,
        },
        loginMethods: [],
        checkInCount: 0,
        postCount: 0,
        favoriteCount: 0,
        weeklyCheckIns: [false, false, false, false, false, false, false],
        streakDays: 0,
        status: 'deleted',
        deletedAt: db.serverDate(),
        updatedAt: db.serverDate(),
        deletionVersion: 1,
      },
    });
  } catch (error) {
    await userRef.update({ data: { status: 'active', deletionFailedAt: db.serverDate(), updatedAt: db.serverDate() } });
    throw error;
  }
  return { success: true, deleted: true, deletionVersion: 1 };
}

async function reactivateAccount(event, userId) {
  const existingUser = await readUser(userId);
  if (!existingUser || existingUser.status !== 'deleted') {
    return { success: false, code: 'ACCOUNT_NOT_DELETED', message: '当前账号不需要重新创建' };
  }
  const profileUpdates = getProfileUpdates(event.profile);
  await db.collection(USERS_COLLECTION).doc(userId).update({
    data: {
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
      privacy: DEFAULT_PRIVACY,
      loginMethods: ['wechat'],
      checkInCount: 0,
      postCount: 0,
      favoriteCount: 0,
      weeklyCheckIns: [false, false, false, false, false, false, false],
      streakDays: 0,
      status: 'active',
      deletedAt: command.remove(),
      deletionVersion: command.remove(),
      reactivatedAt: db.serverDate(),
      updatedAt: db.serverDate(),
      lastLoginAt: db.serverDate(),
    },
  });
  const user = await readUser(userId);
  return { success: true, isNewUser: true, reactivated: true, user: toPublicUser(user) };
}

function toPublicProfile(user, canViewDetails = true) {
  const profile = toPublicUser(user);
  const publicProfile = {
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
  };
  if (canViewDetails) return publicProfile;
  return {
    ...publicProfile,
    introduction: '该用户设置了资料可见范围',
    gender: '',
    grade: '',
    college: '',
    hometown: '',
    foodPreferences: [],
    checkInCount: 0,
    postCount: 0,
  };
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
  const isMine = userId === currentUserId;
  const privacy = normalizePrivacy(user.privacy);
  let isFollowing = false;
  if (!isMine && privacy.profileVisibility === 'followers') {
    try {
      const followId = crypto.createHash('sha256').update(`follow:${currentUserId}:${userId}`).digest('hex').slice(0, 32);
      const result = await db.collection(FOLLOWS_COLLECTION).doc(followId).get();
      isFollowing = Boolean(result.data && result.data.status === 'active');
    } catch (error) {
      isFollowing = false;
    }
  }
  const canViewDetails = isMine || privacy.profileVisibility === 'public' || (privacy.profileVisibility === 'followers' && isFollowing);
  return {
    success: true,
    user: toPublicProfile(user, canViewDetails),
    isMine,
    restricted: !canViewDetails,
  };
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
    if (event.action === 'validateSession') return await validateSession(userId);
    if (event.action === 'deleteAccount') return await deleteAccount(event, context, userId);
    if (event.action === 'reactivateAccount') return await reactivateAccount(event, userId);
    if (event.action === 'getProfile') return await getPublicProfile(event, userId);
    if (event.action === 'updateProfile') return await updateProfile(event, userId);

    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const existingUser = await readUser(userId);
    const profileUpdates = getProfileUpdates(event.profile);
    const loginMethod = event.loginMethod === 'restore' ? 'restore' : 'wechat';

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
          privacy: DEFAULT_PRIVACY,
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
      if (existingUser.status === 'deleted' || existingUser.status === 'deleting') {
        return { success: false, code: 'ACCOUNT_DELETED', message: '该微信身份绑定的账号已注销，如需使用请重新创建账号' };
      }
      if (existingUser.status !== 'active') {
        return { success: false, code: 'USER_DISABLED', message: '账号当前不可用，请联系管理员' };
      }
      const loginMethods = Array.from(new Set([...(existingUser.loginMethods || []), loginMethod]));
      await userRef.update({
        data: {
          ...profileUpdates,
          privacy: normalizePrivacy(existingUser.privacy),
          loginMethods,
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
    const collectionMissing = isMissingCollection(error);
    return {
      success: false,
      message: collectionMissing ? '请先在云开发数据库中创建 users 集合' : message,
    };
  }
};
