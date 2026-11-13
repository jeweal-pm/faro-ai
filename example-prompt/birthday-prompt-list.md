## Implementation status (2026-11-12)

FaroAI's customer-birthday lookup accepts full and abbreviated English/Thai month names,
month/day dates, day-first numeric dates (`DD/MM`), ISO dates, Gregorian birth years,
month plus year, today/yesterday/tomorrow, and a named customer. A valid search with no
matching customer returns an empty result list. Slash dates follow day-first order.
Try prompts such as:

- `Give me Jane Doe's birthday.`
- `What is the date of birth for Jane Doe?`
- `How old is Jane Doe?`
- `Who has a birthday on June 12?`
- `Who has a birthday on 12/06?` (day/month)
- `Find customers born on 1990-06-12.` (ISO date)
- `Show customers born in June.`
- `Show customers born in FEB.`
- `Show customers born in June 1990.`
- `Who has a birthday today?`
- `Who has a birthday tomorrow?`
- `Who had a birthday yesterday?`
- `Show customers with birthdays next month.`
- `List customers born in 1990.`
- Thai equivalents such as `วันเกิดของ Jane Doe`, `ลูกค้าคนไหนเกิดวันที่ 12 มิถุนายน`, or `วันนี้มีลูกค้าคนไหนวันเกิดบ้าง`.

Results are read-only and include customer name, recorded DOB, age when calculable,
primary address, phone, and email.

Rolling multi-day ranges (this/next week, next N days), age ranges, VIP/group/location/
salesperson filters, and incomplete-DOB reports are not implemented. Birthday count
phrasing is accepted for a supported date filter and uses GIS's result total. Numeric
slash dates use day-first order; use ISO (`YYYY-MM-DD`) when a four-digit year is needed.

1. Search by Customer Name
ค้นหาวันเกิดจากชื่อของลูกค้า
1. Give me [customer name]'s birthday.
2. When is [customer name]'s birthday?
3. What is the date of birth of [customer name]?
4. Show me the birthday of [customer name].
5. Find the birth date for [customer name].
6. Can you tell me when [customer name] was born?
7. I want to know [customer name]'s birthday.
8. Search for [customer name]'s date of birth.
9. Does [customer name] have a birthday recorded?
10. Show me [customer name]'s birthday information.
2. Search by Specific Date
ค้นหาลูกค้าที่เกิดตรงกับวันที่กำหนด
11. Give me a list of customers born on June 12th.
12. Who has a birthday on 12th June?
13. Show all customers whose birthday is June 12.
14. Find customers celebrating their birthday on June 12.
15. List customers with birthdays on 12/06.
16. Any customer born on June 12?
17. How many customers have birthdays on June 12?
18. Get all birthday records for June 12th.
19. Which customers were born on December 25?
20. Show me customers born on January 1st.
3. Today, Tomorrow & Yesterday
ค้นหาตามวันปัจจุบันหรือวันใกล้เคียง
21. Who has a birthday today?
22. Show me today's birthdays.
23. Any customer celebrating a birthday today?
24. List all customers born on today's date.
25. How many customer birthdays are there today?
26. Who has a birthday tomorrow?
27. Show me tomorrow's birthday list.
28. Any birthdays coming up tomorrow?
29. Who had a birthday yesterday?
30. Show customers whose birthdays were yesterday.
4. Weekly Birthday Search
ค้นหาวันเกิดตามช่วงสัปดาห์
31. Who has a birthday this week?
32. Show all customer birthdays for this week.
33. List customers celebrating birthdays next week.
34. Any birthdays coming up in the next 7 days?
35. Show birthdays from Monday to Friday.
36. Who has a birthday this weekend?
37. Find customers born during the first week of June.
38. Give me the birthday list for the next 14 days.
39. How many birthdays are coming up this week?
40. Show customers whose birthdays were last week.
5. Monthly Birthday Search
ค้นหาวันเกิดตามเดือน
41. Who has a birthday in June?
42. Show all customers born in June.
43. Give me the birthday list for this month.
44. Which customers have birthdays next month?
45. List all birthdays in December.
46. Show customers with birthdays between January and March.
47. How many customers were born in November?
48. Find customers celebrating birthdays in the current month.
49. Show birthday records for the first half of the year.
50. List birthdays happening in the last three months of the year.
6. Search by Age & Birth Year
ค้นหาจากอายุหรือปีเกิด
51. How old is [customer name]?
52. What year was [customer name] born?
53. Show customers born in 1990.
54. Find customers born before 1980.
55. List customers born after 2000.
56. Who is turning 30 this year?
57. Which customers are turning 50 next month?
58. Show customers aged between 25 and 35.
59. Find customers who are over 60 years old.
60. List customers born between 1995 and 2005.
7. Search by Customer Group & Location
ค้นหาวันเกิดตามกลุ่มลูกค้า สาขา หรือสถานที่
61. Show VIP customers with birthdays this month.
62. Who among our VIP customers has a birthday today?
63. List birthdays of customers from [location].
64. Find customers in [city] whose birthdays are in June.
65. Show birthday records for customers from [branch name].
66. Which active customers have birthdays next week?
67. List birthdays of inactive customers this month.
68. Find customers in [customer group] born on June 12.
69. Show birthdays of customers assigned to [salesperson].
70. Which customers from [country] have birthdays this week?
8. Upcoming Birthdays & Reminders
ค้นหาวันเกิดล่วงหน้าเพื่อใช้ใน CRM และการติดตามลูกค้า
71. Whose birthday is coming up next?
72. Show the next 10 upcoming customer birthdays.
73. Who has a birthday within the next 30 days?
74. Find customers whose birthdays are in the next 3 days.
75. List upcoming birthdays sorted by date.
76. Which customers should we send birthday wishes to this week?
77. Show customers with birthdays coming up in the next 60 days.
78. Are there any birthdays coming up soon?
79. Give me a list of upcoming VIP customer birthdays.
80. Who should receive a birthday greeting tomorrow?
9. Birthday Reports & Data Filtering
รายงาน สรุปข้อมูล และการกรองผลลัพธ์
81. Generate a customer birthday report for June.
82. Show customer names and birthdays only.
83. List customers with their names, dates of birth, and ages.
84. Sort this month's birthdays by date.
85. Group customer birthdays by month.
86. Count the number of customer birthdays in each month.
87. Which month has the most customer birthdays?
88. Find customers without a recorded birthday.
89. Show customers with incomplete birth date information.
90. List customers born on June 12, sorted alphabetically.
10. Natural Language & Casual Questions
ภาษาพูด ประโยคสั้น และข้อความไม่เป็นทางการที่ผู้ใช้จริงอาจพิมพ์
91. Birthday of [customer name]?
92. [customer name] birthday please.
93. June 12 birthday customers.
94. Anyone birthday today?
95. Who birthday tomorrow?
96. Show me June birthdays.
97. Any VIP birthdays soon?
98. Customers born 12 June?
99. Need birthday list for next week.
100. Can you check whose birthday is on 12/6?
