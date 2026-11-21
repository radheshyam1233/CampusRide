const exampleSeller = { id: "example-seller", name: "Example listing" };

export const samples = [
  {
    id: "example-firefox",
    title: "Firefox Bad Attitude 7",
    category: "Cycle",
    price: 6500,
    condition: "Like new",
    location: "Limbdi Hostel",
    description:
      "A 21-speed campus cycle with a recent service, working lights and a cable lock.",
    photos: [],
    previewImage: "/images/campus-cycle.jpg",
    year: 2023,
  },
  {
    id: "example-activa",
    title: "Honda Activa 5G",
    category: "Scooty",
    price: 38000,
    condition: "Good",
    location: "Vishweshvarayya Hostel",
    description:
      "An example of a used scooter listing with service and registration details available at pickup.",
    photos: [],
    year: 2019,
  },
  {
    id: "example-hero",
    title: "Hero Sprint Campus Cycle",
    category: "Cycle",
    price: 3200,
    condition: "Fair",
    location: "Rajputana Hostel",
    description:
      "A single-speed cycle with a rear carrier, fresh brake pads and some cosmetic wear.",
    photos: [],
  },
].map((ride, index) => ({
  ...ride,
  sample: true,
  seller: exampleSeller,
  status: "available",
  createdAt: new Date(Date.UTC(2026, 10, 20 - index)).toISOString(),
}));

export function samplePage(query) {
  const matching = samples.filter(
    (ride) =>
      (!query.category || ride.category === query.category) &&
      (!query.maxPrice || ride.price <= query.maxPrice) &&
      (!query.search ||
        [ride.title, ride.location, ride.description].some((value) =>
          value.toLowerCase().includes(query.search.toLowerCase()),
        )),
  );
  if (query.sort === "low") matching.sort((a, b) => a.price - b.price);
  if (query.sort === "high") matching.sort((a, b) => b.price - a.price);
  const offset = (query.page - 1) * query.limit;
  return {
    listings: matching.slice(offset, offset + query.limit),
    total: matching.length,
    page: query.page,
    pages: Math.ceil(matching.length / query.limit),
  };
}
