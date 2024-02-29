import {
  json,
  type LoaderFunctionArgs,
  type MetaFunction,
} from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { z } from 'zod';

export const meta: MetaFunction = () => {
  return [
    { title: 'New Remix App' },
    { name: 'description', content: 'Welcome to Remix!' },
  ];
};

const UserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  image: z.string().url(),
});

export async function loader({ context, request }: LoaderFunctionArgs) {
  await context.auth.isAuthenticated(request, {
    failureRedirect: '/login',
  });

  const data = await context
    .fetch('https://dummyjson.com/auth/me')
    .then((r) => {
      if (!r.ok) {
        // Throw a new one because Remix will try to mutate it and it will fail
        // if you throw a Response directly received from fetch()
        throw new Response(r.body, r);
      }
      return r.json() as Promise<z.infer<typeof UserSchema>>;
    });

  return json({ data });
}

export default function Index() {
  const { data } = useLoaderData<typeof loader>();
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8' }}>
      <h1>Welcome to Remix</h1>
      <table>
        <tbody>
          <tr>
            <td>Id</td>
            <td>{data.id}</td>
          </tr>
          <tr>
            <td>Username</td>
            <td>{data.username}</td>
          </tr>
          <tr>
            <td>Email</td>
            <td>{data.email}</td>
          </tr>
          <tr>
            <td>First Name</td>
            <td>{data.firstName}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
