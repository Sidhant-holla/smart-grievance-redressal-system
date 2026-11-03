// Sample data for the seed script.
// Tickets are written the way students actually complain - several of them
// describe the same problem in different words so duplicate detection and
// department suggestion can be tested on realistic text.

const departments = [
  { key: 'it', name: 'IT Services', sla: 24, description: 'Wi-Fi, ERP portal, college email, lab computers, projectors' },
  { key: 'hostel', name: 'Hostel & Accommodation', sla: 48, description: 'Hostel rooms, water, electricity, laundry, pest control' },
  { key: 'canteen', name: 'Canteen & Mess', sla: 48, description: 'Food quality, hygiene, pricing in canteen and hostel mess' },
  { key: 'academics', name: 'Academics & Examinations', sla: 120, description: 'Results, marks, attendance, timetable, hall tickets' },
  { key: 'transport', name: 'Transport', sla: 72, description: 'College buses, routes, bus passes' },
  { key: 'maintenance', name: 'Campus Maintenance', sla: 72, description: 'Classrooms, furniture, plumbing, electrical, lifts' },
  { key: 'accounts', name: 'Accounts & Fees', sla: 96, description: 'Fee payment, receipts, refunds, scholarships' },
];

// role: dept_head / staff. available: false means auto-assign skips them
const staff = [
  { key: 'head.it', name: 'Suresh Kumar', dept: 'it', role: 'dept_head', designation: 'Head of IT Services' },
  { key: 'ravi.it', name: 'Ravi Menon', dept: 'it', role: 'staff', designation: 'Network Engineer' },
  { key: 'divya.it', name: 'Divya Rao', dept: 'it', role: 'staff', designation: 'System Administrator' },

  { key: 'head.hostel', name: 'Lakshmi Iyer', dept: 'hostel', role: 'dept_head', designation: 'Chief Warden' },
  { key: 'manoj.hostel', name: 'Manoj Patil', dept: 'hostel', role: 'staff', designation: 'Warden, Boys Hostel' },
  { key: 'kavya.hostel', name: 'Kavya Nair', dept: 'hostel', role: 'staff', designation: 'Warden, Girls Hostel' },

  { key: 'head.canteen', name: 'Rajesh Gupta', dept: 'canteen', role: 'dept_head', designation: 'Food Committee Head' },
  { key: 'sunil.canteen', name: 'Sunil Shetty', dept: 'canteen', role: 'staff', designation: 'Mess Supervisor' },

  { key: 'head.academics', name: 'Meera Krishnan', dept: 'academics', role: 'dept_head', designation: 'Controller of Examinations' },
  { key: 'arjun.academics', name: 'Arjun Desai', dept: 'academics', role: 'staff', designation: 'Exam Section Officer' },
  { key: 'pooja.academics', name: 'Pooja Hegde', dept: 'academics', role: 'staff', designation: 'Academic Coordinator' },

  { key: 'head.transport', name: 'Venkatesh Reddy', dept: 'transport', role: 'dept_head', designation: 'Transport Manager' },
  { key: 'kiran.transport', name: 'Kiran Joshi', dept: 'transport', role: 'staff', designation: 'Transport Coordinator', available: false },

  { key: 'head.maintenance', name: 'Prakash Bhat', dept: 'maintenance', role: 'dept_head', designation: 'Estate Officer' },
  { key: 'ganesh.maintenance', name: 'Ganesh Pillai', dept: 'maintenance', role: 'staff', designation: 'Electrical Supervisor' },
  { key: 'farhan.maintenance', name: 'Farhan Ali', dept: 'maintenance', role: 'staff', designation: 'Civil Works Supervisor' },

  { key: 'head.accounts', name: 'Anita Deshmukh', dept: 'accounts', role: 'dept_head', designation: 'Finance Officer' },
  { key: 'rohit.accounts', name: 'Rohit Agarwal', dept: 'accounts', role: 'staff', designation: 'Accounts Assistant' },
];

const citizens = [
  { key: 'ananya', name: 'Ananya Singh' },
  { key: 'rahul', name: 'Rahul Verma' },
  { key: 'sneha', name: 'Sneha Kulkarni' },
  { key: 'aditya', name: 'Aditya Shenoy' },
  { key: 'fatima', name: 'Fatima Sheikh' },
  { key: 'karthik', name: 'Karthik Raman' },
  { key: 'neha', name: 'Neha Jain' },
  { key: 'vikram', name: 'Vikram Rathore' },
];

// out = final state of the ticket
//   open | assigned | in_progress | resolved | closed | reopened
// ago = days since it was raised, hrs = hours taken to resolve
const tickets = [
  // ---------------- IT Services (SLA 24h) ----------------
  { d: 'it', by: 'ananya', ago: 40, out: 'closed', hrs: 20, rating: 4, loc: 'Block C hostel, 3rd floor',
    title: 'Wi-Fi not working in Block C hostel',
    desc: 'The Wi-Fi on the third floor of C block has not been working since Monday evening. None of the rooms on the floor can connect.' },
  { d: 'it', by: 'rahul', ago: 33, out: 'closed', hrs: 10, rating: 5,
    title: 'Cannot log in to the student ERP portal',
    desc: 'Whenever I try to log in to the ERP portal it says invalid session and logs me out immediately. I tried different browsers and the same thing happens.' },
  { d: 'it', by: 'karthik', ago: 25, out: 'closed', hrs: 30, rating: 3, loc: 'CS Lab 2',
    title: 'Lab computers very slow in CS lab 2',
    desc: 'Most systems in CS lab 2 take more than 10 minutes to boot and freeze when we open the IDE during lab sessions.' },
  { d: 'it', by: 'neha', ago: 18, out: 'closed', hrs: 6, rating: 5,
    title: 'College email account locked',
    desc: 'My college email account got locked after a password reset and I am not receiving any assignment notifications from faculty.' },
  { d: 'it', by: 'sneha', ago: 3, out: 'resolved', hrs: 15, loc: 'Central library',
    title: 'Library printer not connecting',
    desc: 'The network printer in the central library is not visible from any of the library computers, so nobody is able to print.' },
  { d: 'it', by: 'aditya', ago: 0.5, out: 'in_progress', pri: 'HIGH', loc: 'Boys hostel',
    title: 'Internet very slow in hostel rooms at night',
    desc: 'Every night after 9 pm the internet speed in the hostel rooms drops so much that even loading a web page takes minutes. Online classes and submissions are getting affected.' },
  { d: 'it', by: 'fatima', ago: 2, out: 'assigned', loc: 'Room 304, Main block',
    title: 'Projector HDMI port not working in room 304',
    desc: 'The HDMI port of the projector in room 304 does not detect any laptop, so faculty have had to cancel presentations twice this week.' },
  { d: 'it', by: 'vikram', ago: 0.2, out: 'open', loc: 'Hostel room B-221',
    title: 'No internet connection in my hostel room',
    desc: 'I am unable to stay connected to the internet from my room in the hostel, the connection keeps dropping every few minutes especially in the evening.' },

  // ---------------- Hostel (SLA 48h) ----------------
  { d: 'hostel', by: 'rahul', ago: 38, out: 'closed', hrs: 40, rating: 4, loc: 'Block A, 2nd floor',
    title: 'Water leakage in hostel bathroom',
    desc: 'There is continuous water leakage from the ceiling of the common bathroom on the second floor of Block A hostel.' },
  { d: 'hostel', by: 'sneha', ago: 28, out: 'closed', hrs: 60, rating: 2, loc: 'Girls hostel B wing',
    title: 'No hot water in girls hostel',
    desc: 'The geysers in the girls hostel B wing have not been working for three days and there is no hot water in the mornings.' },
  { d: 'hostel', by: 'karthik', ago: 20, out: 'closed', hrs: 12, rating: 5, loc: 'Room A-214',
    title: 'Room door lock broken',
    desc: 'The lock of my room door (A-214) is broken and the room cannot be locked when I go out for classes.' },
  { d: 'hostel', by: 'aditya', ago: 12, out: 'closed', hrs: 30, rating: 4, loc: 'Block D hostel',
    title: 'Frequent power cuts in hostel block D',
    desc: 'Block D hostel has power cuts almost every evening and the backup generator does not start, so we cannot study at night.' },
  { d: 'hostel', by: 'neha', ago: 1, out: 'in_progress', pri: 'HIGH', loc: 'Block B, 1st floor',
    title: 'Bed bugs in hostel rooms',
    desc: 'Several rooms on the first floor of Block B have bed bugs and students are getting bitten every night. Pest control is needed urgently.' },
  { d: 'hostel', by: 'ananya', ago: 5, out: 'assigned', loc: 'Block C laundry room',
    title: 'Washing machines not working in laundry room',
    desc: 'Both washing machines in the Block C laundry room have been out of order for a week and students have to wash clothes by hand.' },
  { d: 'hostel', by: 'fatima', ago: 4, out: 'resolved', hrs: 20, loc: 'Room B-108',
    title: 'Fan not working in hostel room',
    desc: 'The ceiling fan in room B-108 stopped working and it is very hot at night, it is impossible to sleep.' },

  // ---------------- Canteen (SLA 48h) ----------------
  { d: 'canteen', by: 'vikram', ago: 35, out: 'closed', hrs: 24, rating: 3, loc: 'Main canteen',
    title: 'Stale food served in main canteen',
    desc: 'The food served in the main canteen at lunch today was stale and cold. The rice smelled bad and some students threw it away.' },
  { d: 'canteen', by: 'karthik', ago: 27, out: 'closed', hrs: 50, rating: 4, loc: 'Main canteen',
    title: 'Overpricing of snacks in canteen',
    desc: 'The canteen is charging more than the printed MRP for packaged snacks and cold drinks. This has been going on for weeks.' },
  { d: 'canteen', by: 'sneha', ago: 15, out: 'closed', hrs: 8, rating: 4, pri: 'HIGH', loc: 'Hostel mess',
    title: 'Insects found in mess food',
    desc: 'Found insects in the dal served during dinner at the hostel mess yesterday. Many students saw it and stopped eating.' },
  { d: 'canteen', by: 'rahul', ago: 1, out: 'assigned', loc: 'Near main canteen',
    title: 'Drinking water cooler near canteen is dirty',
    desc: 'The water cooler near the canteen is not cleaned, the water tastes bad and there is a green deposit inside the tap.' },
  { d: 'canteen', by: 'aditya', ago: 0.3, out: 'open', pri: 'HIGH', loc: 'Hostel mess',
    title: 'Mess food quality is very poor',
    desc: 'The dinner in the hostel mess has been really bad this week. The food was spoiled on Tuesday and a few of us had stomach problems.' },

  // ---------------- Academics (SLA 120h) ----------------
  { d: 'academics', by: 'ananya', ago: 45, out: 'closed', hrs: 100, rating: 3,
    title: 'Semester results not published',
    desc: 'Results for the 3rd semester end-sem exams were supposed to be announced two weeks ago but they are still not available on the portal.' },
  { d: 'academics', by: 'neha', ago: 30, out: 'closed', hrs: 72, rating: 4,
    title: 'Internal marks not updated on portal',
    desc: 'My internal assessment marks for Data Structures are not visible on the student portal even though all other subjects are updated.' },
  { d: 'academics', by: 'karthik', ago: 22, out: 'closed', hrs: 20, rating: 5, pri: 'HIGH',
    title: 'Clash in end semester exam timetable',
    desc: 'The end semester timetable has the DBMS and Operating Systems exams on the same day in the same slot for 5th semester students.' },
  { d: 'academics', by: 'vikram', ago: 14, out: 'closed', hrs: 96, rating: 4,
    title: 'Attendance wrongly marked absent',
    desc: 'I was present for all Computer Networks classes last week but the portal shows me absent for three of them.' },
  { d: 'academics', by: 'rahul', ago: 6, out: 'resolved', hrs: 110,
    title: 'Revaluation result still pending',
    desc: 'I applied for revaluation of my Engineering Mathematics paper a month ago and there is still no update on the result.' },
  { d: 'academics', by: 'fatima', ago: 2, out: 'in_progress', pri: 'HIGH',
    title: 'Hall ticket not getting generated',
    desc: 'My hall ticket for the upcoming exams is not getting generated. The portal says fee dues are pending but I have already paid the full fee.' },
  { d: 'academics', by: 'sneha', ago: 8, out: 'assigned',
    title: 'Lab manual not provided for ML lab',
    desc: 'The lab manual for the Machine Learning lab has not been shared even though lab sessions started three weeks ago.' },

  // ---------------- Transport (SLA 72h) ----------------
  { d: 'transport', by: 'aditya', ago: 36, out: 'closed', hrs: 48, rating: 3,
    title: 'College bus late every morning',
    desc: 'The route 5 bus arrives 30 to 40 minutes late every morning so we keep missing the first class.' },
  { d: 'transport', by: 'neha', ago: 24, out: 'closed', hrs: 20, rating: 5, pri: 'HIGH',
    title: 'Bus driver driving rashly',
    desc: 'The driver of bus number 12 drives very fast and brakes suddenly. Students standing inside the bus fall down.' },
  { d: 'transport', by: 'karthik', ago: 16, out: 'closed', hrs: 90, rating: 2,
    title: 'Bus pass not issued after payment',
    desc: 'I paid the transport fee two weeks ago but I have still not received my bus pass and the conductor is asking for it.' },
  { d: 'transport', by: 'ananya', ago: 4, out: 'open',
    title: 'No bus on Saturday for extra classes',
    desc: 'Extra classes are scheduled on Saturdays but no college bus runs on Saturday, students from far areas are unable to attend.' },
  { d: 'transport', by: 'vikram', ago: 0.5, out: 'open',
    title: 'Route 7 bus skipped my stop',
    desc: 'The route 7 bus did not stop at the Banashankari stop today and yesterday, several students were left waiting on the road.' },

  // ---------------- Maintenance (SLA 72h) ----------------
  { d: 'maintenance', by: 'rahul', ago: 37, out: 'closed', hrs: 30, rating: 4, loc: 'Room 110, Main block',
    title: 'Fans not working in classroom 110',
    desc: 'Two ceiling fans in classroom 110 of the main block are not working and the room gets very hot during afternoon lectures.' },
  { d: 'maintenance', by: 'fatima', ago: 29, out: 'closed', hrs: 80, rating: 3, loc: 'Room 204',
    title: 'Water leaking from roof in room 204',
    desc: 'When it rains, water drips from the ceiling of room 204 onto the benches and floor, and we have to shift to another room.' },
  { d: 'maintenance', by: 'sneha', ago: 19, out: 'closed', hrs: 60, rating: 4, loc: 'Seminar hall',
    title: 'Broken benches in seminar hall',
    desc: 'Many benches in the seminar hall are broken and students cannot sit properly during department events.' },
  { d: 'maintenance', by: 'aditya', ago: 9, out: 'closed', hrs: 20, rating: 5, loc: 'Academic block, 2nd floor',
    title: 'Washroom taps leaking in academic block',
    desc: 'The taps in the second floor washroom of the academic block keep leaking and the floor is always wet and slippery.' },
  { d: 'maintenance', by: 'karthik', ago: 1, out: 'in_progress', pri: 'HIGH', loc: 'New academic block',
    title: 'Lift not working in new block',
    desc: 'The lift in the new academic block has been stuck on the ground floor since yesterday. Students with injuries cannot reach the 5th floor labs.' },
  { d: 'maintenance', by: 'neha', ago: 2, out: 'assigned', pri: 'HIGH', loc: 'Parking to girls hostel road',
    title: 'Streetlights not working near parking',
    desc: 'The streetlights between the parking area and the girls hostel are not working and the road is completely dark at night. It is unsafe.' },
  { d: 'maintenance', by: 'vikram', ago: 0.3, out: 'open', loc: 'New academic block',
    title: 'Elevator stuck in the new building',
    desc: 'The elevator in the new building has not been working since yesterday morning and everyone has to climb five floors to reach the labs.' },

  // ---------------- Accounts (SLA 96h) ----------------
  { d: 'accounts', by: 'fatima', ago: 34, out: 'closed', hrs: 48, rating: 4,
    title: 'Fee receipt not generated',
    desc: 'I paid the semester fee online but the receipt was not generated and the portal still shows the fee as pending.' },
  { d: 'accounts', by: 'ananya', ago: 26, out: 'closed', hrs: 150, rating: 2,
    title: 'Scholarship amount not credited',
    desc: 'The merit scholarship for last semester has still not been credited to my bank account even though the list was published.' },
  { d: 'accounts', by: 'rahul', ago: 17, out: 'closed', hrs: 70, rating: 4, pri: 'HIGH',
    title: 'Semester fee deducted twice',
    desc: 'My semester fee was deducted twice from my bank account during online payment. I need a refund of the extra amount.' },
  { d: 'accounts', by: 'vikram', ago: 3, out: 'assigned',
    title: 'Caution deposit refund pending',
    desc: 'My caution deposit refund is still pending even after submitting the refund form with all documents two months ago.' },
  { d: 'accounts', by: 'neha', ago: 5, out: 'reopened', hrs: 40,
    title: 'Wrong late fee charged',
    desc: 'A late fee of Rs 500 was added to my account even though I paid the semester fee before the due date.' },
];

// "I have the same problem" - [ticket title, citizen keys]
const supporters = [
  ['Internet very slow in hostel rooms at night', ['rahul', 'sneha', 'karthik']],
  ['Lift not working in new block', ['neha', 'fatima']],
  ['Washing machines not working in laundry room', ['sneha']],
  ['Route 7 bus skipped my stop', ['aditya', 'ananya']],
  ['Bed bugs in hostel rooms', ['ananya', 'fatima', 'rahul', 'vikram']],
];

module.exports = { departments, staff, citizens, tickets, supporters };
