# Phần 2: Thư viện dùng chung

Trạng thái: **xong**

## Kết quả (`packages/shared/src`)

| File | Nội dung |
|------|----------|
| `schema.ts` | Zod cho mẫu vị trí, trạng thái phòng/phiên, message client↔server; bảng ký tự mã phòng |
| `geo.ts` | Haversine, `distanceUncertainty`, ENU cục bộ và ngược lại, `inferSource` |
| `pairing.ts` | Ghép mẫu hai máy theo thời gian server, mỗi mẫu dùng một lần, ngưỡng mặc định 1000 ms |
| `stats.ts` | `errorStats` (bias, MAE, std, RMSE, max, tỉ lệ trong σ), lọc đo tĩnh, trung bình ENU, CEP50 |
| `csv.ts` | CSV mẫu và CSV cặp, dùng chung cho server |

Client và server dùng cùng mã này, nên màn hình và CSV luôn cho cùng kết quả.

## Kiểm chứng

`pnpm --filter @rtk/shared test`: 25 test, gồm 20,00 m theo hướng bắc và đông tại
Hà Nội và TP.HCM, 1 độ kinh tuyến = R·π/180, ghép mẫu có lệch giờ/thiếu mẫu/không
sắp xếp, thống kê sai số với đáp án tính tay, trung bình đám điểm hình tròn.
