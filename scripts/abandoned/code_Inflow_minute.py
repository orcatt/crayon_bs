import sys
import json
import efinance as ef

def fetch_stock_data(stock_code):
    try:
        # 获取股票当日单子流入数据（分钟级）
        stock_df = ef.stock.get_today_bill(stock_code)
        
        # 检查数据是否为空
        if stock_df is None or stock_df.empty:
            return json.dumps({
                "error": "获取的股票数据为空"
            }, ensure_ascii=False)
            
        # 转换为 JSON 格式返回
        return stock_df.to_json(orient='records', force_ascii=False)
    except Exception as e:
        return json.dumps({
            "error": f"获取数据失败: {str(e)}"
        }, ensure_ascii=False)

if __name__ == "__main__":
    # 获取命令行参数
    stock_code = sys.argv[1]      # 股票代码
    
    try:
        # 获取股票数据
        stock_data_json = fetch_stock_data(stock_code)
        
        # 检查是否是错误信息
        try:
            error_data = json.loads(stock_data_json)
            if "error" in error_data:
                print(stock_data_json)
                sys.exit(1)
        except:
            pass
            
        # 将数据封装成字典，并转换为 JSON 格式
        result = {
            "code": stock_code,
            "list": json.loads(stock_data_json)
        }
        
        # 输出结果
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "error": f"处理数据失败: {str(e)}"
        }, ensure_ascii=False))
        sys.exit(1)