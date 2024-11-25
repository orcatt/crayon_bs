const schedule = require('node-schedule');
const axios = require('axios');
const db = require('../config/db'); // 数据库连接

// API 配置
const { HL_API_URL, HL_API_KEY } = require('../config/config');

// 定时任务：每天固定时间执行
const fetchAndUpdateAlmanac = () => {
  // 定时任务：每天凌晨 0:00 执行
  schedule.scheduleJob('0 0 * * *', async () => {
    console.log('开始执行黄历数据更新任务...', new Date().toLocaleString());

    try {
      // 请求黄历 API 数据
      const response = await axios.get(HL_API_URL, { params: { key: HL_API_KEY } });

      if (response.data.code !== 200) {
        console.error('获取黄历数据失败:', response.data);
        return;
      }

      const data = response.data.result;

      // 准备插入数据
      const insertData = {
        gregoriandate: data.gregoriandate,
        lunardate: data.lunardate,
        lunar_festival: data.lunar_festival || null,
        festival: data.festival || null,
        fitness: data.fitness || null,
        taboo: data.taboo || null,
        shenwei: data.shenwei || null,
        taishen: data.taishen || null,
        chongsha: data.chongsha || null,
        suisha: data.suisha || null,
        wuxingjiazi: data.wuxingjiazi || null,
        wuxingnayear: data.wuxingnayear || null,
        wuxingnamonth: data.wuxingnamonth || null,
        xingsu: data.xingsu || null,
        pengzu: data.pengzu || null,
        jianshen: data.jianshen || null,
        tiangandizhiyear: data.tiangandizhiyear || null,
        tiangandizhimonth: data.tiangandizhimonth || null,
        tiangandizhiday: data.tiangandizhiday || null,
        lmonthname: data.lmonthname || null,
        shengxiao: data.shengxiao || null,
        lubarmonth: data.lubarmonth || null,
        lunarday: data.lunarday || null,
        jieqi: data.jieqi || null,
      };

      // 插入或更新数据（根据公历日期更新）
      const [result] = await db.query(
        `
        INSERT INTO almanac (
          gregoriandate, lunardate, lunar_festival, festival, fitness, taboo,
          shenwei, taishen, chongsha, suisha, wuxingjiazi, wuxingnayear, wuxingnamonth,
          xingsu, pengzu, jianshen, tiangandizhiyear, tiangandizhimonth, tiangandizhiday,
          lmonthname, shengxiao, lubarmonth, lunarday, jieqi
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          lunardate = VALUES(lunardate),
          lunar_festival = VALUES(lunar_festival),
          festival = VALUES(festival),
          fitness = VALUES(fitness),
          taboo = VALUES(taboo),
          shenwei = VALUES(shenwei),
          taishen = VALUES(taishen),
          chongsha = VALUES(chongsha),
          suisha = VALUES(suisha),
          wuxingjiazi = VALUES(wuxingjiazi),
          wuxingnayear = VALUES(wuxingnayear),
          wuxingnamonth = VALUES(wuxingnamonth),
          xingsu = VALUES(xingsu),
          pengzu = VALUES(pengzu),
          jianshen = VALUES(jianshen),
          tiangandizhiyear = VALUES(tiangandizhiyear),
          tiangandizhimonth = VALUES(tiangandizhimonth),
          tiangandizhiday = VALUES(tiangandizhiday),
          lmonthname = VALUES(lmonthname),
          shengxiao = VALUES(shengxiao),
          lubarmonth = VALUES(lubarmonth),
          lunarday = VALUES(lunarday),
          jieqi = VALUES(jieqi)
        `,
        Object.values(insertData)
      );

      console.log('黄历数据更新成功:', result.affectedRows > 0 ? '数据已插入/更新' : '无变动');
    } catch (err) {
      console.error('黄历数据更新失败:', err);
    }
  });
};

module.exports = fetchAndUpdateAlmanac;